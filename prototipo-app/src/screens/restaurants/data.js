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
// `cuisine`: la cocina de la API (`/catalog/restaurants?cuisine=`) que filtra la lista; sin ella, la categoría abre el buscador.
export const CATEGORIES = [
  { id: 'turbo', label: 'Turbo Restaurantes', img: rcatTurbo, query: 'turbo' },
  { id: 'pizzas', label: 'Pizzas', img: rcatPizza, cuisine: 'Pizzas' },
  { id: 'hamburguesa', label: 'Hamburguesa', img: rcatBurger, cuisine: 'Hamburguesa' },
  { id: 'culinaria', label: 'Experiencia Culinaria', img: rcatCulinaria, partial: true, cuisine: 'Experiencias Culinarias' },
]

// En la captura solo se ve el primer banner (Tung Fong). Son publicidad de la app, no tiendas del catálogo: no abren ninguna.
export const BANNERS = [
  { id: 'tungfong', label: 'Tung Fong', img: bannerTungFong },
  { id: 'streetwrap', title: 'Enjoy Up to 40% Off', place: 'at Street Wrap', img: againStreetWrap },
  { id: 'mcd', title: 'Enjoy Up to 33% Off', place: "at Mcdonald's - Turbo", img: againMcd },
]
