import { VERTICAL_NAMES } from '../../data/verticals'
import { MAIN_TILES, SHORTCUTS } from '../../data/home'
import Img from '../Img'
import './discover.css'

// Las mismas ilustraciones de la Home: la persona reconoce cada vertical de un vistazo.
const TILE_IMAGES = Object.fromEntries([...MAIN_TILES, ...SHORTCUTS].map((tile) => [tile.id, tile.img]))

const THUMBS = 3

/** «snacks-salados» → «Snacks salados». */
const conceptLabel = (concept) => {
  const words = concept.replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * «Descubre con Mochi»: tarjetas de /recommendations, cada una con un complemento de lo que le gusta a la persona en una
 * vertical que quizá aún no abre. `rows` son las filas de la API (hasta 3); tocar una tarjeta abre su vertical.
 */
export default function DiscoverSection({ rows, onOpen }) {
  const cards = rows.filter((row) => VERTICAL_NAMES[row.prototype_vertical])
  if (cards.length === 0) return null

  return (
    <section className="discover" aria-labelledby="discover-title">
      <h2 id="discover-title" className="search-heading">
        Descubre con Mochi
      </h2>

      <div className="discover-cards">
        {cards.map((row, i) => (
          <button
            key={`${row.concept}-${row.prototype_vertical}`}
            type="button"
            className="discover-card tap"
            style={{ animationDelay: `${180 + i * 80}ms` }}
            onClick={() => onOpen(row.prototype_vertical)}
          >
            <span className="discover-card-art" aria-hidden="true">
              <img src={TILE_IMAGES[row.prototype_vertical]} alt="" draggable="false" loading="lazy" />
            </span>
            <span className="discover-card-body">
              <small>{row.reason}</small>
              <strong>
                {conceptLabel(row.concept)} en {VERTICAL_NAMES[row.prototype_vertical]}
              </strong>
              <span className="discover-card-foot">
                <span className="discover-thumbs" aria-hidden="true">
                  {row.products.slice(0, THUMBS).map((product) => (
                    <Img key={product.id} src={product.img} draggable="false" />
                  ))}
                </span>
                <em>Explorar</em>
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
