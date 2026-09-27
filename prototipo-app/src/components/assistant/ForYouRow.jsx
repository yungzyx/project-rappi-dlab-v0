import HScroll from '../HScroll'
import { ProductCard } from '../ProductCard'
import { findStore } from '../../data/catalog'
import { SparkleIcon } from './SmartBar'
import './for-you.css'

/**
 * Fila de recomendaciones de Bigotes (modo Propuesta): productos de otras verticales con la razón visible.
 * Tocar un producto abre su tienda.
 */
export default function ForYouRow({ title, reason, products, push }) {
  if (products.length === 0) return null

  const openStore = (product) =>
    push('store', { store: findStore(product.store) ?? { name: product.store, img: product.storeLogo ?? product.img, logo: true } })

  return (
    <section className="for-you">
      <div className="for-you-head">
        <h2>
          <SparkleIcon size={20} />
          {title}
        </h2>
        {reason && <span className="for-you-reason">{reason}</span>}
      </div>
      <HScroll className="for-you-row">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} onClick={() => openStore(product)} />
        ))}
      </HScroll>
    </section>
  )
}
