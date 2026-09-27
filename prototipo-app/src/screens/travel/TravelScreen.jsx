import { useEffect, useRef, useState } from 'react'
import { useToast } from '../../components/Toast'
import hero1 from '../../assets/v/travel-hero1.webp'
import hero2 from '../../assets/v/travel-hero2.webp'
import hoteles from '../../assets/v/travel-hoteles.webp'
import vuelos from '../../assets/v/travel-vuelos.webp'
import paquetes from '../../assets/v/travel-paquetes.webp'
import tours from '../../assets/v/travel-tours.webp'
import autos from '../../assets/v/travel-autos.webp'
import marriott from '../../assets/v/travel-marriott.webp'
import proWeek from '../../assets/v/travel-proweek.webp'
import './travel.css'

// Los botones del hero (volver, campana, Ayuda, Mis Viajes, "Ver destinos") vienen dibujados en la imagen,
// iguales en ambos banners; por eso el carrusel es un fundido y encima van zonas táctiles invisibles.
const HEROES = [
  { id: 'hoteles40', img: hero1, cta: { left: 36, top: 238, width: 82, height: 20 } },
  { id: 'bonvoy', img: hero2, cta: { left: 147, top: 244, width: 108, height: 22 } },
]
const HERO_MS = 4500
const SWIPE_PX = 40

const TILES = [
  { id: 'hoteles', label: 'Hoteles', img: hoteles },
  { id: 'vuelos', label: 'Vuelos', img: vuelos },
  { id: 'paquetes', label: 'Paquetes', img: paquetes },
  { id: 'tours', label: 'Tours y Actividades', img: tours },
  { id: 'autos', label: 'Autos', img: autos },
  { id: 'marriott', label: 'Marriott Bonvoy', img: marriott },
]

/** RappiTravel (capturas IMG_9127 y 9128). Reservas de viaje: simuladas con avisos. */
export default function TravelScreen({ back }) {
  const toast = useToast()
  const [index, setIndex] = useState(0)
  const [query, setQuery] = useState('')
  const startX = useRef(null)

  useEffect(() => {
    const timer = setTimeout(() => setIndex((i) => (i + 1) % HEROES.length), HERO_MS)
    return () => clearTimeout(timer)
  }, [index])

  const onPointerDown = (e) => {
    startX.current = e.clientX
  }
  const onPointerUp = (e) => {
    if (startX.current === null) return
    const dx = e.clientX - startX.current
    startX.current = null
    if (Math.abs(dx) < SWIPE_PX) return
    setIndex((i) => (i + (dx < 0 ? 1 : HEROES.length - 1)) % HEROES.length)
  }

  const submit = (e) => {
    e.preventDefault()
    toast(query.trim() ? `Buscando viajes a “${query.trim()}” (simulado)` : 'Escribe un destino')
  }

  const hero = HEROES[index]

  return (
    <div className="screen travel">
      <div className="travel-hero" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        {HEROES.map((item, i) => (
          <img key={item.id} src={item.img} alt="" draggable="false" className={i === index ? 'is-active' : undefined} />
        ))}
        <button type="button" className="travel-hit travel-hit--back" aria-label="Volver" onClick={back} />
        <button type="button" className="travel-hit travel-hit--bell" aria-label="Notificaciones" onClick={() => toast('No tienes notificaciones')} />
        <button type="button" className="travel-hit travel-hit--help" aria-label="Ayuda" onClick={() => toast()} />
        <button type="button" className="travel-hit travel-hit--trips" aria-label="Mis Viajes" onClick={() => toast('Aún no tienes viajes')} />
        <button
          type="button"
          className="travel-hit"
          aria-label="Ver destinos"
          style={hero.cta}
          onClick={() => toast('Destinos: reserva no incluida en el prototipo')}
        />
      </div>

      <section className="travel-sheet">
        <form className="travel-search" onSubmit={submit}>
          <input
            type="search"
            placeholder="¿A dónde te llevamos hoy?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" aria-label="Buscar">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <circle cx="10" cy="10" r="6.5" />
              <path d="M15 15l5.5 5.5M7.2 8.3a3.3 3.3 0 0 1 3-2" />
            </svg>
          </button>
        </form>

        <div className="travel-tiles">
          {TILES.map((tile) => (
            <button key={tile.id} type="button" className="travel-tile tap" onClick={() => toast(`${tile.label}: reserva no incluida en el prototipo`)}>
              <img src={tile.img} alt="" />
              <span>{tile.label}</span>
            </button>
          ))}
        </div>

        <button type="button" className="travel-proweek tap" onClick={() => toast()}>
          <img src={proWeek} alt="Pro week: vuela sin pagar cargo de servicio" />
        </button>
      </section>
    </div>
  )
}
