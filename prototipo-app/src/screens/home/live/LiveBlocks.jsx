import HScroll from '../../../components/HScroll'
import Img from '../../../components/Img'
import { ProductCard } from '../../../components/ProductCard'
import { formatPrice, parsePrice } from '../../../state/CartContext'
import { storeFor } from '../../../data/catalog'
import { VERTICAL_NAMES } from '../../../data/verticals'
import { EtaIcon } from '../../../components/StoreMeta'
import { PASSPORT, PASSPORT_GOAL } from '../../../state/liveMemory'
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
export function Passport({ stamps, fresh, onOpen }) {
  const count = stamps.length
  const left = Math.max(PASSPORT_GOAL - count, 0)
  return (
    <section className={left > 0 ? 'live-passport' : 'live-passport is-complete'}>
      <div className="live-passport-head">
        <h2>Tu pasaporte Rappi</h2>
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
        {PASSPORT.map(({ id, emoji }) => {
          const has = stamps.includes(id)
          return (
            <button
              key={id}
              type="button"
              className={`live-stamp tap${has ? ' has' : ''}${fresh === id ? ' is-fresh' : ''}`}
              aria-label={`${VERTICAL_NAMES[id]}${has ? ' (con sello)' : ' (sin sello: ábrela para sellar)'}`}
              onClick={() => onOpen(id)}
            >
              <span className="live-stamp-face" aria-hidden="true">
                {has ? emoji : '?'}
              </span>
              <span className="live-stamp-name">{VERTICAL_NAMES[id]}</span>
            </button>
          )
        })}
      </HScroll>
    </section>
  )
}
