import HScroll from '../../../components/HScroll'
import Img from '../../../components/Img'
import { ProductCard } from '../../../components/ProductCard'
import { formatPrice, parsePrice } from '../../../state/CartContext'
import { storeFor } from '../../../data/catalog'
import { VERTICAL_NAMES } from '../../../data/verticals'
import { EtaIcon } from '../../../components/StoreMeta'
import { DATA } from '../../../game/data.js'
import { stampedVerticals, verticalLevel } from '../../../game/progress.js'
import { GAME_TO_SCREEN, PASSPORT_GOAL } from '../../../game/verticals.js'
import { PLANS } from './script'

/** Abre la tienda de un producto o una tienda (un plato real abre su sucursal por id). */
export function openItem(item, push) {
  if (item.kind === 'store') return push('store', { store: item.store })
  const { product } = item
  return push('store', {
    store: storeFor({ id: product.storeId, name: product.store }) ?? {
      name: product.store,
      img: product.storeLogo ?? product.img,
      logo: true,
    },
    item: product,
  })
}

function StoreItem({ store, onClick }) {
  return (
    <button type="button" className="live-store tap" onClick={onClick}>
      <span className={store.logo ? 'live-store-logo is-logo' : 'live-store-logo'}>
        <Img src={store.img} draggable="false" />
      </span>
      <span className="live-store-name">{store.name}</span>
      <span className="live-store-eta">
        <EtaIcon kind={store.etaIcon ?? 'bolt'} />
        {store.eta}
      </span>
    </button>
  )
}

function ItemRow({ items, onOpen }) {
  return (
    <HScroll className="live-items">
      {items.map((item, i) => (
        <div key={item.key} className="live-item" style={{ '--i': i }}>
          {item.kind === 'product' ? (
            <ProductCard product={item.product} onOpenStore={() => onOpen(item)} />
          ) : (
            <StoreItem store={item.store} onClick={() => onOpen(item)} />
          )}
        </div>
      ))}
    </HScroll>
  )
}

/** «¿Qué plan tienes hoy?»: Bigotes arma un kit de varias verticales para la ocasión. */
export function PlanBlock({ plan, kit, added, onPick, onOpen, onAddKit, onCheckout }) {
  const products = kit.filter((item) => item.kind === 'product')
  const total = products.reduce((sum, item) => sum + parsePrice(item.product.price), 0)
  const verticals = [...new Set(kit.map((item) => VERTICAL_NAMES[item.vertical] ?? item.vertical))]
  return (
    <section className="live-card live-card--plan">
      <h2 className="live-plan-title">¿Qué plan tienes hoy?</h2>
      <div className="live-plan-chips" role="radiogroup" aria-label="Plan de hoy">
        {PLANS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={plan === option.id}
            className={plan === option.id ? 'live-plan-chip is-active tap' : 'live-plan-chip tap'}
            onClick={() => onPick(option.id)}
          >
            <span aria-hidden="true">{option.emoji}</span>
            {option.label}
          </button>
        ))}
      </div>
      {plan ? (
        <div key={plan} className="live-kit">
          <p className="live-kit-meta">
            Tu kit en {verticals.length} {verticals.length === 1 ? 'vertical' : 'verticales'}: {verticals.join(', ')}
          </p>
          <ItemRow items={kit} onOpen={onOpen} />
          {products.length > 0 &&
            (added ? (
              <button type="button" className="live-kit-add is-added tap" onClick={onCheckout}>
                ✓ En tu carro · Ir a pagar
              </button>
            ) : (
              <button type="button" className="live-kit-add tap" onClick={onAddKit}>
                Agregar el kit · {formatPrice(total)}
              </button>
            ))}
        </div>
      ) : (
        <p className="live-plan-empty">Elige uno y te armo todo de una, de las tiendas que hagan falta.</p>
      )}
    </section>
  )
}

/** Pasaporte de verticales: un sello por cada vertical probada; al llegar a la meta, envío gratis (demo). */
// Un emoji por vertical del juego, para la cara del sello.
export const STAMP_EMOJI = {
  supermercado: '🛒',
  conveniencia: '🏪',
  turbo: '⚡',
  licores: '🍷',
  chocolateria: '🍫',
  restaurantes: '🍔',
  farmacia: '💊',
  mall: '🛍️',
}
const LEVEL_NAMES = { explorador: 'Explorador', conocedor: 'Conocedor', experto: 'Experto' }

/**
 * El pasaporte Rappi es el del juego de verticales: un sello por vertical (Explorador o más, jugando o abriéndola en la
 * app), con su nivel en el borde. El título abre el pasaporte del juego, «Jugar» su camino y cada sello su vertical.
 */
export function Passport({ state, fresh, onOpenGame, onOpenStamp }) {
  const count = stampedVerticals(state).length
  const left = Math.max(PASSPORT_GOAL - count, 0)
  return (
    <section className={left > 0 ? 'live-passport' : 'live-passport is-complete'}>
      <div className="live-passport-head">
        <div className="live-passport-top">
          <h2>
            <button type="button" className="live-passport-title tap" onClick={() => onOpenGame('pasaporte')}>
              Tu pasaporte Rappi <span aria-hidden="true">›</span>
            </button>
          </h2>
          <button type="button" className="live-passport-play tap" onClick={() => onOpenGame('jugar')}>
            Jugar
          </button>
        </div>
        <p>
          {left > 0
            ? `${count} sellos · te ${left === 1 ? 'falta 1' : `faltan ${left}`} para el envío gratis`
            : `${count} sellos · ¡envío gratis desbloqueado! 🎉`}
        </p>
        <div
          className="live-passport-bar"
          role="progressbar"
          aria-label="Sellos para el envío gratis"
          aria-valuemin={0}
          aria-valuemax={PASSPORT_GOAL}
          aria-valuenow={Math.min(count, PASSPORT_GOAL)}
        >
          <span style={{ '--progress': Math.min(count / PASSPORT_GOAL, 1) }} />
        </div>
      </div>
      <HScroll className="live-stamps">
        {DATA.order.map((vertical) => {
          const level = verticalLevel(state, vertical)
          const has = level !== 'ninguno'
          const name = VERTICAL_NAMES[GAME_TO_SCREEN[vertical]]
          return (
            <button
              key={vertical}
              type="button"
              className={`live-stamp tap is-${level}${has ? ' has' : ''}${fresh === GAME_TO_SCREEN[vertical] ? ' is-fresh' : ''}`}
              aria-label={`${name}${has ? ` (con sello: ${LEVEL_NAMES[level]})` : ' (sin sello: juega o ábrela para sellar)'}`}
              onClick={() => onOpenStamp(vertical)}
            >
              <span className="live-stamp-face" aria-hidden="true">
                {has ? STAMP_EMOJI[vertical] : '?'}
              </span>
              <span className="live-stamp-name">{name}</span>
            </button>
          )
        })}
      </HScroll>
    </section>
  )
}
