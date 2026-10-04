import catRestaurants from '../../assets/cat-restaurants.webp'
import catTurbo from '../../assets/cat-turbo.webp'
import creditsCoin from '../../assets/credits-coin.webp'
import chipGrocery from '../../assets/chip-grocery.webp'
import chipPharmacy from '../../assets/chip-pharmacy.webp'
import chipRetail from '../../assets/chip-retail.webp'
import chipLiquor from '../../assets/chip-liquor.webp'
import chipExpress from '../../assets/chip-express.webp'
import chipPet from '../../assets/chip-pet.webp'
import chipChocolates from '../../assets/chip-chocolates.webp'
import chipRappiTravel from '../../assets/chip-rappitravel.webp'
import chipLoyalty from '../../assets/chip-loyalty.webp'
import chipBenefitsPro from '../../assets/chip-benefitspro.webp'
import chipRappiFavorOff from '../../assets/chip-rappifavor-off.webp'
import bannerDescuentos from '../../assets/banner-descuentos.webp'
import bannerCena from '../../assets/banner-cena.webp'
import featKfc from '../../assets/feat-kfc.webp'
import featMcd from '../../assets/feat-mcd.webp'
import storeUnimarc from '../../assets/store-unimarc.webp'
import storeFarmacias from '../../assets/store-farmacias.webp'
import storeCruzVerde from '../../assets/store-cruzverde.webp'
import storeOxxo from '../../assets/store-oxxo.webp'
import storeMiMarket from '../../assets/store-mimarket.webp'
import storeLiquidos from '../../assets/store-liquidos.webp'

export const CREDITS = {
  logo: creditsCoin,
  title: '$1.900 Credits',
  subtitle: 'in Todofarma Market',
  expiresInMinutes: 116,
}

export const MAIN_TILES = [
  { id: 'restaurants', label: 'Restaurants', img: catRestaurants, screen: 'restaurants' },
  { id: 'turbo', label: 'Turbo', img: catTurbo, screen: 'turbo' },
]

// RappiFavor aparece deshabilitado como en la app (la imagen trae el sello "Unavailable"); en «Propuesta» se habilita
// con su pantalla (`proposalRoute`).
// `route` dice a qué pantalla lleva cada acceso (ver HomeFeed).
export const SHORTCUTS = [
  { id: 'grocery', label: 'Grocery', img: chipGrocery, route: ['vertical', { id: 'grocery' }] },
  { id: 'pharmacy', label: 'Pharmacy', img: chipPharmacy, route: ['vertical', { id: 'pharmacy' }] },
  { id: 'retail', label: 'Retail', img: chipRetail, route: ['vertical', { id: 'retail' }] },
  { id: 'liquor', label: 'Liquor', img: chipLiquor, route: ['vertical', { id: 'liquor' }] },
  { id: 'express', label: 'Express', img: chipExpress, route: ['vertical', { id: 'express' }] },
  { id: 'pet', label: 'Pet', img: chipPet, route: ['vertical', { id: 'pet' }] },
  { id: 'chocolates', label: 'Chocolates', img: chipChocolates, route: ['vertical', { id: 'chocolates' }] },
  { id: 'rappitravel', label: 'RappiTravel', img: chipRappiTravel, route: ['travel'] },
  { id: 'loyalty', label: 'Loyalty', img: chipLoyalty, route: ['loyalty'] },
  { id: 'benefitspro', label: 'Benefits Pro', img: chipBenefitsPro },
  {
    id: 'rappifavor',
    label: 'RappiFavor',
    img: chipRappiFavorOff,
    unavailable: true,
    proposalRoute: ['favor'],
    emoji: '🛵',
  },
]

// La app muestra 6 banners; en capturas y video solo se ven completos estos dos.
export const PROMOS = [
  { id: 'descuentos', img: bannerDescuentos, fit: 'top', route: ['restaurants'] },
  { id: 'cena', img: bannerCena, fit: 'cover', route: ['restaurants'] },
]
export const PROMO_START_INDEX = 1

export const TURBO_RESTAURANTS = [
  { id: 'kfc', name: 'Kfc Turbo', rating: '4.6', eta: '9 mins', distance: '1.2 km', img: featKfc, turbo: true },
  { id: 'mcd', name: "Mcdonald's Turbo", rating: '4.5', eta: '9 mins', distance: '1.4 km', img: featMcd, turbo: true },
]

export const NEARBY_STORES = [
  { id: 'unimarc', name: 'Unimarc', when: 'Sun, 9 AM', scheduled: true, img: storeUnimarc },
  { id: 'farmacias', name: 'Farmacias Ahumada', when: 'Sun, 11 AM', img: storeFarmacias },
  { id: 'cruzverde', name: 'Cruz Verde', when: '26 min or sooner', img: storeCruzVerde },
  { id: 'oxxo', name: 'OXXO', when: '21 min or sooner', img: storeOxxo },
  { id: 'mimarket', name: 'Mi Market', when: '25 min or sooner', img: storeMiMarket },
  { id: 'liquidos', name: 'Liquidos', when: '23 min or sooner', img: storeLiquidos },
]

// En el video la fila de la Home queda tapada por la barra; se usa la misma lista que en Deals.
export { LOWER_FEES } from '../deals/data'
