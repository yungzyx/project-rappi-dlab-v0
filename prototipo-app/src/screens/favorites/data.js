// Contenido de la pestaña Favorites (video del 26-09-2026, ScreenRecording 22-25-25).
import favMcd from '../../assets/fav-mcd.webp'
import favStreetWrap from '../../assets/fav-streetwrap.webp'
import favJustBurger from '../../assets/fav-justburger.webp'
import favCruzVerde from '../../assets/fav-cruzverde.webp'
import favGetIt from '../../assets/fav-getit.webp'
import favUmami from '../../assets/fav-umami.webp'
import favLaFuente from '../../assets/fav-lafuente.webp'
import favYapones from '../../assets/fav-yapones.webp'
import favSushiRyge from '../../assets/fav-sushiryge.webp'

export const FAVORITE_STORES = [
  { id: 'fav-mcd', name: "McDonald's", logo: favMcd },
  { id: 'fav-streetwrap', name: 'Street Wrap', logo: favStreetWrap },
  { id: 'fav-justburger', name: 'Just Burger', logo: favJustBurger },
  { id: 'fav-mcdturbo', name: "Mcdonald's - Turbo", logo: favMcd },
]

export const BEST_GROCERY = [
  { id: 'g-cruzverde', name: 'Cruz Verde', eta: '26 min or sched.', etaIcon: 'bolt', img: favCruzVerde },
  { id: 'g-getit', name: 'Get It', eta: '49 min or sched.', etaIcon: 'clock', img: favGetIt },
]

// Sushi Ryge aparece cortado: rating y distancia son supuestos.
export const BEST_RESTAURANTS = [
  { id: 'r-umami', name: 'Umami Nikkei', rating: '4.6', eta: '34 mins', fee: '$890', distance: '2.8 km', etaIcon: 'none', img: favUmami },
  { id: 'r-lafuente', name: 'La Fuente Carrera', rating: '4.8', eta: '26 mins', fee: '$690', distance: '2 km', etaIcon: 'none', img: favLaFuente },
  { id: 'r-yapones', name: 'Yapones', rating: '4.8', eta: '31 mins', fee: '$890', distance: '2.2 km', etaIcon: 'none', img: favYapones },
  { id: 'r-sushiryge', name: 'Sushi Ryge', rating: '4.7', eta: '28 mins', fee: '$690', distance: '1.9 km', etaIcon: 'none', img: favSushiRyge },
]
