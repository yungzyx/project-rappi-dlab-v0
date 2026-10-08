import { EXPLORABLE } from '../../assistant/explored'
import { VERTICAL_NAMES } from '../../data/verticals'
import { MAIN_TILES, SHORTCUTS } from '../../screens/home/data'
import HScroll from '../HScroll'
import './discover.css'

// Las mismas ilustraciones de la Home: la persona reconoce cada vertical de un vistazo.
const TILE_IMAGES = Object.fromEntries([...MAIN_TILES, ...SHORTCUTS].map((tile) => [tile.id, tile.img]))

const itemImage = (item) => (item.kind === 'product' ? item.product.img : item.store.img)

/**
 * «Descubre con Bigotes»: cuántas verticales lleva exploradas y tarjetas que cruzan sus gustos con una vertical
 * nueva. Tocar una tarjeta (o una vertical del recorrido) la abre.
 */
export default function DiscoverSection({ cards, explored, onOpen }) {
  const done = EXPLORABLE.filter((vertical) => explored.includes(vertical)).length

  return (
    <section className="discover" aria-labelledby="discover-title">
      <div className="discover-head">
        <h2 id="discover-title" className="search-heading">
          Descubre con Bigotes
        </h2>
        <span className="discover-count">
          Exploraste <b>{done}</b> de {EXPLORABLE.length}
        </span>
      </div>
      <div
        className="discover-meter"
        role="progressbar"
        aria-label="Verticales exploradas"
        aria-valuemin={0}
        aria-valuemax={EXPLORABLE.length}
        aria-valuenow={done}
      >
        <span style={{ transform: `scaleX(${done / EXPLORABLE.length})` }} />
      </div>

      <HScroll className="discover-stamps">
        {EXPLORABLE.map((vertical) => {
          const isDone = explored.includes(vertical)
          return (
            <button
              key={vertical}
              type="button"
              className={isDone ? 'discover-stamp is-done' : 'discover-stamp'}
              aria-label={`${VERTICAL_NAMES[vertical]}${isDone ? ', ya la exploraste' : ''}`}
              onClick={() => onOpen(vertical)}
            >
              <span className="discover-stamp-art">
                <img src={TILE_IMAGES[vertical]} alt="" draggable="false" />
              </span>
              <span className="discover-stamp-name">{VERTICAL_NAMES[vertical]}</span>
            </button>
          )
        })}
      </HScroll>

      <div className="discover-cards">
        {cards.map((card, i) => (
          <button
            key={card.vertical}
            type="button"
            className="discover-card tap"
            style={{ animationDelay: `${180 + i * 80}ms` }}
            onClick={() => onOpen(card.vertical)}
          >
            <span className="discover-card-art" aria-hidden="true">
              <img src={TILE_IMAGES[card.vertical]} alt="" draggable="false" />
            </span>
            <span className="discover-card-body">
              <small>
                {card.from
                  ? `Te gusta ${card.from.emoji} ${card.from.label.toLowerCase()}`
                  : `Aún no exploras ${card.verticalName}`}
              </small>
              <strong>
                {card.to.emoji} {card.to.label} en {card.verticalName}
              </strong>
              <span className="discover-card-foot">
                <span className="discover-thumbs" aria-hidden="true">
                  {card.items.map((item) => (
                    <img key={item.key} src={itemImage(item)} alt="" draggable="false" />
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
