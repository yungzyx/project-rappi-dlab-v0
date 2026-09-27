// Contenido de Offers → Deals transcrito del video del 26-09-2026 (ScreenRecording 23).
// Datos que el video no deja ver (tapados por la barra o cortados en el borde) van marcados con "supuesto".
import dealKfc from '../../assets/deal-kfc.webp'
import dealChicken from '../../assets/deal-chicken.webp'
import dealPapaJohns from '../../assets/deal-papajohns.webp'
import logoKfc from '../../assets/logo-kfc.webp'
import logoChickenFactory from '../../assets/logo-chickenfactory.webp'
import logoPapaJohns from '../../assets/logo-papajohns.webp'
import logoPapaJohnsSm from '../../assets/logo-papajohns-sm.webp'
import logoPizzaDelivery from '../../assets/logo-pizzadelivery.webp'
import logoUnimarc from '../../assets/logo-unimarc.webp'
import logoExpress from '../../assets/logo-express.webp'
import logoLiquidos from '../../assets/logo-liquidos.webp'
import logoTag from '../../assets/logo-tag.webp'
import logoAhumada from '../../assets/logo-ahumada.webp'
import lowerMcd from '../../assets/lower-mcd.webp'
import lowerKfc from '../../assets/lower-kfc.webp'
import lowerBkTurbo from '../../assets/lower-bkturbo.webp'
import lowerBk from '../../assets/lower-bk.webp'
import lowerJustBurger from '../../assets/lower-justburger.webp'
import lowerPapaJohns from '../../assets/lower-papajohns.webp'
import mostPizzaDelivery from '../../assets/most-pizzadelivery.webp'
import mostMcdTurbo from '../../assets/most-mcdturbo.webp'
import mostChickensMcdo from '../../assets/most-chickensmcdo.webp'
import mostChickenFactory from '../../assets/most-chickenfactory.webp'
import mostRelativo from '../../assets/most-relativo.webp'
import mostPoke from '../../assets/most-poke.webp'
import mostMiguelayo from '../../assets/most-miguelayo.webp'
import newLocalBurger from '../../assets/new-localburger.webp'
import newPitaHouse from '../../assets/new-pitahouse.webp'
import pizzaAmericana from '../../assets/pizza-americana.webp'
import pizzaComboLunch from '../../assets/pizza-combolunch.webp'
import icPizza from '../../assets/ic-pizza.webp'
import icMeat from '../../assets/ic-meat.webp'
import icBeers from '../../assets/ic-beers.webp'
import icGarden from '../../assets/ic-garden.webp'
import icBaby from '../../assets/ic-baby.webp'
import pKingNuggets from '../../assets/p-kingnuggets.webp'
import pSuperPollo from '../../assets/p-superpollo.webp'
import pSperPollo from '../../assets/p-sperpollo.webp'
import pRoyalGuard from '../../assets/p-royalguard.webp'
import pPlaceholder from '../../assets/p-placeholder.webp'
import pHeineken from '../../assets/p-heineken.webp'
import pManitoba from '../../assets/p-manitoba.webp'
import pBudweiser from '../../assets/p-budweiser.webp'
import pPalta from '../../assets/p-palta.webp'
import pZapallo from '../../assets/p-zapallo.webp'
import pHabas from '../../assets/p-habas.webp'
import pNaranja from '../../assets/p-naranja.webp'
import pMandarina from '../../assets/p-mandarina.webp'
import pPampers60 from '../../assets/p-pampers60.webp'
import pPampers86 from '../../assets/p-pampers86.webp'

export const CRAZY_DEALS = [
  {
    id: 'deal-wow-bucket',
    img: dealKfc,
    price: '$10.990',
    discount: '-52%',
    before: '$23.000',
    name: 'Wow Bucket Promo',
    store: 'Kfc Turbo',
    storeLogo: logoKfc,
    eta: '15 min',
    etaIcon: 'turbo',
  },
  {
    id: 'deal-combo-aniversario',
    img: dealChicken,
    price: '$11.990',
    discount: '-40%',
    before: '$19.990',
    name: 'Combo Aniversario',
    store: 'Chicken Factory',
    storeLogo: logoChickenFactory,
    eta: '14 min',
    etaIcon: 'clock',
  },
  {
    id: 'deal-mediana-palitos',
    img: dealPapaJohns,
    price: '$5.990',
    discount: '-59%',
    before: '$14.890',
    name: 'Mediana a elección mas Mini Palitos',
    store: 'Papa Johns Pizza',
    storeLogo: logoPapaJohns,
    eta: '24 min',
    etaIcon: 'clock',
  },
]

const SHIPPING = 'FREE SHIPPING'

export const LOWER_FEES = [
  { id: 'r-mcd', name: "McDonald's", rating: '4.70', eta: '12 min', distance: '1.4 km', img: lowerMcd, deliveryLabel: SHIPPING },
  { id: 'r-kfc', name: 'Kfc Turbo', rating: '4.60', eta: '15 min', distance: '1.5 km', img: lowerKfc, deliveryLabel: SHIPPING, etaIcon: 'turbo' },
  { id: 'r-bkturbo', name: 'Burger King Turbo', rating: '4.30', eta: '14 min', distance: '1.5 km', img: lowerBkTurbo, deliveryLabel: SHIPPING, etaIcon: 'turbo' },
  { id: 'r-bk', name: 'Burger King®', rating: '4.60', eta: '15 min', distance: '1.5 km', img: lowerBk, deliveryLabel: SHIPPING },
  { id: 'r-justburger', name: 'Just Burger', rating: '4.80', eta: '12 min', distance: '1.5 km', img: lowerJustBurger, deliveryLabel: SHIPPING },
  // rating y distancia: supuesto (tapados en el video)
  { id: 'r-papajohns', name: 'Papa Johns Pizza', rating: '4.50', eta: '24 min', distance: '1.8 km', img: lowerPapaJohns, deliveryLabel: SHIPPING },
]

export const MOST_ORDERED = [
  // tiempo: supuesto (tapado por la barra)
  { id: 'r-pizzadelivery', name: 'Pizza Delivery', rating: '4.70', eta: '15 min', distance: '7.8 km', img: mostPizzaDelivery, deliveryLabel: SHIPPING },
  { id: 'r-mcdturbo', name: "Mcdonald's - Turbo", rating: '4.30', eta: '11 min', distance: '1.4 km', img: mostMcdTurbo, deliveryLabel: SHIPPING, etaIcon: 'turbo' },
  { id: 'r-chickensmcdo', name: "Chickens de McDonald's", rating: '3.90', eta: '15 min', distance: '1.4 km', img: mostChickensMcdo, deliveryLabel: SHIPPING },
  { id: 'r-chickenfactory', name: 'Chicken Factory', rating: '4.80', eta: '14 min', distance: '2.1 km', img: mostChickenFactory, deliveryLabel: SHIPPING },
  { id: 'r-relativo', name: 'Relativo Restaurante', rating: '4.70', eta: '20 min', distance: '2.4 km', img: mostRelativo, deliveryLabel: SHIPPING },
  { id: 'r-poke', name: 'My Poke Nikkei Sanhattan', rating: '4.20', eta: '35 min', distance: '4.1 km', img: mostPoke, deliveryLabel: SHIPPING, etaIcon: 'clock' },
  { id: 'r-miguelayo', name: 'Miguelayo', rating: '4.70', eta: '15 min', distance: '3.2 km', img: mostMiguelayo, deliveryLabel: SHIPPING },
]

export const TOP_PIZZAS = [
  {
    id: 'pizza-americana',
    img: pizzaAmericana,
    price: '$7.380',
    discount: '-30%',
    proDiscount: true,
    before: '$10.540',
    name: 'Pizza americana individual + bebida lata',
    store: 'Pizza Delivery',
    storeLogo: logoPizzaDelivery,
    eta: '15 min',
    etaIcon: 'clock',
  },
  {
    id: 'pizza-combo-lunch',
    img: pizzaComboLunch,
    price: '$6.990',
    discount: '-25%',
    before: '$9.390',
    name: 'Combo Lunch',
    store: 'Papa Johns Pizza',
    storeLogo: logoPapaJohnsSm,
    eta: '24 min',
    etaIcon: 'clock',
  },
]
export const TOP_PIZZAS_ICON = icPizza

// Pita House solo se ve cortada en el borde; la fila no hace scroll para no mostrar el recorte.
export const NEW_IN_RAPPI = [
  { id: 'r-localburger', name: 'Local Burger', rating: '4.70', eta: '24 min', distance: '2.3 km', img: newLocalBurger, deliveryLabel: SHIPPING },
  { id: 'r-pitahouse', name: 'Pita House', rating: '4.60', eta: '20 min', distance: '2.0 km', img: newPitaHouse, deliveryLabel: SHIPPING, partial: true },
]

const UNIMARC = { store: 'Unimarc', storeLogo: logoUnimarc, eta: 'Sun, 9 AM', etaIcon: 'clock' }
const EXPRESS = { store: 'Express Lider', storeLogo: logoExpress, eta: 'Sun, 9 AM', etaIcon: 'clock' }
const LIQUIDOS = { store: 'Liquidos', storeLogo: logoLiquidos, eta: '26 min or sched.', etaIcon: 'bolt' }
const TAG = { store: 'Botilleria Tag', storeLogo: logoTag, eta: '36 min or sched.', etaIcon: 'clock' }
const AHUMADA = { store: 'Farmacias Ahumada', storeLogo: logoAhumada, eta: 'Sun, 11 AM', etaIcon: 'bolt' }

export const GROCERY_SECTIONS = [
  {
    id: 'meat',
    title: 'Meat & Seafood',
    icon: icMeat,
    products: [
      { id: 'p-kingnuggets', img: pKingNuggets, price: '$1.000', before: '$1.690', discount: '-41%', name: 'King Nuggets de Pollo Congelados', size: '300 g', unit: '$3.34/g', ...UNIMARC },
      { id: 'p-superpollo', img: pSuperPollo, price: '$3.000', before: '$4.300', discount: '-30%', name: 'Super Pollo Tuto Corto de Pollo Congelado', size: '800 g', unit: '$3.75/g', ...UNIMARC },
      { id: 'p-sperpollo', img: pSperPollo, price: '$3.850', before: '$5.550', discount: '-31%', name: 'Sper Pollo Trutro Corto y Largo Deshuesados', size: '1 x 750 g', unit: '$5.14/g', ...EXPRESS },
    ],
  },
  {
    id: 'beers',
    title: 'Cheers-worthy beers',
    icon: icBeers,
    products: [
      { id: 'p-royalguard', img: pRoyalGuard, price: '$6.290', before: '$8.490', discount: '-26%', name: 'Royal Guard Cerveza Tipo Lager 6 latas', size: '1 X 470 mL', unit: '$13.39/ml', ...LIQUIDOS },
      { id: 'p-jesternube', img: pPlaceholder, price: '$4.720', before: '$5.900', discount: '-20%', name: 'Jester Cerveza La Nube Pale Ale Lata', size: '1 X 473 mL', unit: '$9.98/ml', ...TAG },
      { id: 'p-heineken', img: pHeineken, price: '$6.690', before: '$9.090', discount: '-26%', name: 'Heineken Cerveza Lager Original en Botella', size: '6 X 330 mL', unit: '$20.28/ml', ...LIQUIDOS },
      { id: 'p-manitoba', img: pManitoba, price: '$4.800', before: '$6.000', discount: '-20%', name: 'Jester Cerveza Manitoba Pale Ale', size: '1 X 473 mL', unit: '$10.15/ml', ...TAG },
      { id: 'p-budweiser', img: pBudweiser, price: '$6.190', before: '$9.690', discount: '-36%', name: 'Cerveza Budweiser Ow 330 cc', size: '6 X 330 mL', unit: '$18.76/ml', ...LIQUIDOS },
    ],
  },
  {
    id: 'garden',
    title: 'Garden-fresh products',
    icon: icGarden,
    products: [
      { id: 'p-palta', img: pPalta, price: '$3.280', before: '$4.990', discount: '-34%', name: 'Palta Hass Malla', size: '1 Kg', unit: '$3.29/g', ...UNIMARC },
      { id: 'p-palta600', img: pPlaceholder, price: '$2.390', before: '$3.550', discount: '-33%', name: 'Palta Hass Malla 600gs', size: '600 g', unit: '$3.99/g', ...UNIMARC },
      { id: 'p-zapallo', img: pZapallo, price: '$1.190', before: '$1.590', discount: '-25%', name: 'Nuestra Cocina Zapallo en Cubo', size: '1 x 500 g', unit: '$2.38/g', ...UNIMARC },
      { id: 'p-habas', img: pHabas, price: '$1.590', before: '$2.290', discount: '-31%', name: 'Nuestra Cocina Haba Con Piel Congelada', size: '500 g', unit: '$3.18/g', ...UNIMARC },
      { id: 'p-naranja', img: pNaranja, price: '$2.620', before: '$3.630', discount: '-28%', name: 'Naranja malla 2 kgd2714', size: '1 Und', unit: '$2629.60/und', ...EXPRESS },
      { id: 'p-mandarina', img: pMandarina, price: '$2.110', before: '$3.110', discount: '-32%', name: 'Mandarina', size: 'X 1 Kg', unit: '$2.12/g', ...EXPRESS },
    ],
  },
  {
    id: 'baby',
    title: 'Baby care',
    icon: icBaby,
    products: [
      { id: 'p-pampers60', img: pPampers60, price: '$23.390', before: '$32.500', discount: '-28%', name: 'Pampers Pañal Premium Care Talla XG', size: '1 X 60 Und', unit: '$389.99/und', ...AHUMADA },
      { id: 'p-pampers86', img: pPampers86, price: '$23.180', before: '$32.200', discount: '-28%', name: 'Pampers Pañal Premium Care Talla M', size: '1 X 86 Und', unit: '$269.57/und', ...AHUMADA },
    ],
  },
]
