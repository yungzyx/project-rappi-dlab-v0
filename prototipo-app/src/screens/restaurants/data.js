import rcatTurbo from '../../assets/rcat-turbo.webp'
import rcatPizza from '../../assets/rcat-pizza.webp'
import rcatBurger from '../../assets/rcat-burger.webp'
import rcatCulinaria from '../../assets/rcat-culinaria.webp'
import bannerTungFong from '../../assets/banner-tungfong.webp'
import againStreetWrap from '../../assets/again-streetwrap.webp'
import againMcd from '../../assets/again-mcd.webp'

export const FILTERS = [
  { id: 'sort', label: 'Sort', kind: 'menu' },
  { id: 'top', label: 'Top', icon: 'trophy', kind: 'toggle' },
  { id: 'fast', label: '35 mins', icon: 'bolt', kind: 'toggle' },
  { id: 'rating', label: '+ 4.5', icon: 'star', kind: 'toggle' },
]

// "Experiencia Culinaria" queda cortada en el borde de la captura; se recorta igual.
export const CATEGORIES = [
  { id: 'turbo', label: 'Turbo Restaurantes', img: rcatTurbo, query: 'turbo' },
  { id: 'pizzas', label: 'Pizzas', img: rcatPizza, query: 'pizza' },
  { id: 'hamburguesa', label: 'Hamburguesa', img: rcatBurger, query: 'burger' },
  { id: 'culinaria', label: 'Experiencia Culinaria', img: rcatCulinaria, partial: true, query: 'restaurante' },
]

// La captura muestra 8 puntos; solo el primer banner (Tung Fong) se ve.
export const BANNERS = [
  { id: 'tungfong', img: bannerTungFong, store: { name: 'Tung Fong', img: bannerTungFong, eta: '30 min', deliveryLabel: 'FREE DELIVERY' } },
  { id: 'streetwrap', title: 'Enjoy Up to 40% Off', place: 'at Street Wrap', img: againStreetWrap },
  { id: 'mcd', title: 'Enjoy Up to 33% Off', place: "at Mcdonald's - Turbo", img: againMcd },
]
export const BANNER_DOTS = 8

export const ORDER_AGAIN = [
  { id: 'streetwrap', name: 'Street Wrap', eta: '14 min', img: againStreetWrap },
  { id: 'mcd', name: "Mcdonald's - Turbo", eta: '11 min', img: againMcd },
]
